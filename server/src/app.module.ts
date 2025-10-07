import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TodoListModule } from './todo_list/todo_list.module';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    TodoListModule,
    MongooseModule.forRoot('mongodb://localhost:27017/todo-list'),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
