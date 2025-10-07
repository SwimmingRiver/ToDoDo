import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateTodoListDto } from './dto/create-todo_list.dto';
import { UpdateTodoListDto } from './dto/update-todo_list.dto';
import { TodoList } from './entities/todo_list.entity';

@Injectable()
export class TodoListService {
  constructor(
    @InjectModel(TodoList.name) private todoListModel: Model<TodoList>,
  ) {}

  async create(createTodoListDto: CreateTodoListDto) {
    const createdTodoList = new this.todoListModel(createTodoListDto);
    return await createdTodoList.save();
  }

  async findAll() {
    return await this.todoListModel.find().exec();
  }

  async findOne(id: string) {
    return await this.todoListModel.findById(id).exec();
  }

  async update(id: string, updateTodoListDto: UpdateTodoListDto) {
    return await this.todoListModel
      .findByIdAndUpdate(id, updateTodoListDto, { new: true })
      .exec();
  }

  async remove(id: string) {
    return await this.todoListModel.findByIdAndDelete(id).exec();
  }
}
