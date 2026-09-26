import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ContextService } from '../tenant/context.service';
import { PLAN_ORDER } from '../../common/decorators/plan-level.decorator';
import { dayRange, localYmd } from '../dashboard/dashboard-day.util';
import { readAssistantConfig } from './assistant.config';
import { buildSystemPrompt } from './assistant.prompt';
import { runAssistantLoop } from './assistant-loop';
import { ASSISTANT_TOOLS, AssistantTools } from './assistant-tools';
import type { AssistantActor } from './assistant-tools';
import { ASSISTANT_PROVIDER } from './provider';
import type { AssistantProvider } from './provider';
import type { SendMessageDto } from './dto/send-message.dto';

const HISTORY_LIMIT = 8;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ContextService,
    private readonly tools: AssistantTools,
    @Optional()
    @Inject(ASSISTANT_PROVIDER)
    private readonly provider: AssistantProvider | null,
  ) {}

  status() {
    return { enabled: this.isConfigured() && this.planAllows() };
  }

  async latest(userId: string) {
    const orgId = this.orgId();
    const thread = await this.prisma.assistantThread.findFirst({
      where: { organizationId: orgId, userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    });
    if (!thread) return { thread: null };
    return {
      thread: {
        id: thread.id,
        messages: [...thread.messages].reverse().map(toMessage),
      },
    };
  }

  async send(userId: string, dto: SendMessageDto) {
    const config = readAssistantConfig();
    if (!config || !this.provider) {
      throw new ServiceUnavailableException({
        code: 'ASSISTANT.UNAVAILABLE',
        message: 'ASSISTANT.UNAVAILABLE',
      });
    }

    const orgId = this.orgId();
    await this.assertDailyLimit(orgId, config.dailyLimit);

    let threadId = dto.threadId;
    if (threadId) {
      const existing = await this.prisma.assistantThread.findFirst({
        where: { id: threadId, organizationId: orgId, userId },
      });
      if (!existing) {
        throw new NotFoundException({
          code: 'ASSISTANT.THREAD_NOT_FOUND',
          message: 'ASSISTANT.THREAD_NOT_FOUND',
        });
      }
    }

    const prior = threadId
      ? await this.prisma.assistantMessage.findMany({
          where: { threadId },
          orderBy: { createdAt: 'desc' },
          take: HISTORY_LIMIT - 1,
        })
      : [];

    const history = [...prior].reverse().map((message) => ({
      role:
        message.role === 'assistant'
          ? ('assistant' as const)
          : ('user' as const),
      content: message.content,
    }));
    history.push({ role: 'user', content: dto.content });

    const actor = this.actor(userId, orgId);
    const result = await runAssistantLoop({
      provider: this.provider,
      execute: (name, args) => this.tools.execute(name, args, actor),
      system: buildSystemPrompt(localYmd()),
      history,
      tools: ASSISTANT_TOOLS,
    }).catch((error: unknown) => {
      this.logger.error(
        `assistant provider failed ${error instanceof Error ? error.name : 'error'}`,
      );
      throw new ServiceUnavailableException({
        code: 'ASSISTANT.UNAVAILABLE',
        message: 'ASSISTANT.UNAVAILABLE',
      });
    });

    if (!threadId) {
      const created = await this.prisma.assistantThread.create({
        data: {
          organizationId: orgId,
          userId,
          title: dto.content.slice(0, 80),
        },
      });
      threadId = created.id;
    } else {
      await this.prisma.assistantThread.update({
        where: { id: threadId },
        data: { updatedAt: new Date() },
      });
    }

    await this.prisma.assistantMessage.create({
      data: { threadId, role: 'user', content: dto.content },
    });
    const saved = await this.prisma.assistantMessage.create({
      data: {
        threadId,
        role: 'assistant',
        content: result.text,
        reportId: result.reportId,
      },
    });

    return { threadId, message: toMessage(saved) };
  }

  private isConfigured(): boolean {
    return readAssistantConfig() !== null && this.provider !== null;
  }

  private planAllows(): boolean {
    const ctx = this.context.getCurrent();
    if (ctx?.systemRole === 'master' || ctx?.isSuperAdmin) return true;
    const current = PLAN_ORDER[ctx?.plan?.name ?? ''];
    return current !== undefined && current >= PLAN_ORDER.professional;
  }

  private orgId(): string {
    const orgId = this.context.getCurrent()?.organizationId;
    if (!orgId) throw new Error('No organization context');
    return orgId;
  }

  private actor(userId: string, organizationId: string): AssistantActor {
    const ctx = this.context.getCurrent();
    return {
      userId,
      organizationId,
      orgRole: ctx?.orgRole,
      systemRole: ctx?.systemRole,
      isSuperAdmin: ctx?.isSuperAdmin,
    };
  }

  private async assertDailyLimit(organizationId: string, limit: number) {
    const { start, end } = dayRange(localYmd());
    const used = await this.prisma.assistantMessage.count({
      where: {
        role: 'user',
        createdAt: { gte: start, lt: end },
        thread: { organizationId },
      },
    });
    if (used >= limit) {
      throw new HttpException(
        { code: 'ASSISTANT.DAILY_LIMIT', message: 'ASSISTANT.DAILY_LIMIT' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}

function toMessage(message: {
  id: string;
  role: string;
  content: string;
  reportId: string | null;
  createdAt: Date;
}) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    reportId: message.reportId,
    createdAt: message.createdAt.toISOString(),
  };
}
