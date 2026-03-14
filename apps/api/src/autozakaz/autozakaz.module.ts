import { Module } from '@nestjs/common';
import { AutozakazController } from './autozakaz.controller';
import { AutozakazService } from './autozakaz.service';

@Module({
  controllers: [AutozakazController],
  providers: [AutozakazService],
})
export class AutozakazModule {}
