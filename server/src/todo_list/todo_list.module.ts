import { Module } from '@nestjs/common';
import { TodoListService } from './todo_list.service';
import { TodoListController } from './todo_list.controller';

@Module({
  controllers: [TodoListController],
  providers: [TodoListService],
})
export class TodoListModule {}
