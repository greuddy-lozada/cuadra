import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AssistantService } from './assistant.service';
import { SendMessageDto } from './dto/send-message.dto';
import {
  MinOrgLevel,
  ROLE_LEVEL,
} from '../../common/decorators/min-level.decorator';
import { PlanLevel } from '../../common/decorators/plan-level.decorator';

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

@Controller('assistant')
@MinOrgLevel(ROLE_LEVEL.employee)
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Get('status')
  status() {
    return this.assistant.status();
  }

  @Get('thread')
  @PlanLevel('professional')
  latest(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.assistant.latest(userId);
  }

  @Post('messages')
  @PlanLevel('professional')
  @Throttle({ default: { limit: 20, ttl: 600000 } })
  send(@Body() dto: SendMessageDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.assistant.send(userId, dto);
  }
}
