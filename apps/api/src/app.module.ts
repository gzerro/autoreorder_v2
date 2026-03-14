import { Module } from '@nestjs/common';
import { AutozakazModule } from './autozakaz/autozakaz.module';

@Module({
  imports: [AutozakazModule],
})
export class AppModule {}
