import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { AutozakazModule } from './autozakaz/autozakaz.module';

@Module({
  imports: [AuthModule, AutozakazModule],
})
export class AppModule {}
