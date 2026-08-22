import { Module } from '@nestjs/common';
import { TabletMenuHtmlController } from './tablet-menu-html.controller';

@Module({
  controllers: [TabletMenuHtmlController],
})
export class TabletMenuHtmlModule {}
