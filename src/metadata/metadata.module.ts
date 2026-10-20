import { Module } from '@nestjs/common';
import { MetadataController, MetadataService } from './metadata.controller.ts';

@Module({ controllers: [MetadataController], providers: [MetadataService] })
export class MetadataModule {}
