import { Global, Module } from '@nestjs/common';
import { FoliosRepository } from './folios.repository';

@Global()
@Module({
  providers: [FoliosRepository],
  exports: [FoliosRepository],
})
export class FoliosModule {}
