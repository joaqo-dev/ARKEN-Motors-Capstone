import { Module } from '@nestjs/common';
import { AutomotorasController } from './automotoras.controller';
import { AutomotorasRepository } from './automotoras.repository';
import { AutomotorasService } from './automotoras.service';

@Module({
  controllers: [AutomotorasController],
  providers: [AutomotorasRepository, AutomotorasService],
  exports: [AutomotorasRepository],
})
export class AutomotorasModule {}
