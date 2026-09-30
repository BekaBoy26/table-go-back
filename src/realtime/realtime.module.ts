import { Global, Module } from '@nestjs/common';
import { AvailabilityGateway } from './availability.gateway.js';

@Global()
@Module({
  providers: [AvailabilityGateway],
  exports: [AvailabilityGateway],
})
export class RealtimeModule {}
