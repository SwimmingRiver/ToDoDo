import { Module } from '@nestjs/common';
import { TodoListService } from './todo_list.service';
import { TodoListController } from './todo_list.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { TodoList, TodoListSchema } from './entities/todo_list.entity';

@Module({
  controllers: [TodoListController],
  providers: [TodoListService],
  imports: [
    MongooseModule.forFeature([
      { name: TodoList.name, schema: TodoListSchema },
    ]),
  ],
})
export class TodoListModule {}
