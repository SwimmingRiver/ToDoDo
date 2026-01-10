import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Error } from 'mongoose';
import { CreateTodoListDto } from './dto/create-todo_list.dto';
import { UpdateTodoListDto } from './dto/update-todo_list.dto';
import { TodoList } from './entities/todo_list.entity';

@Injectable()
export class TodoListService {
  constructor(
    @InjectModel(TodoList.name) private todoListModel: Model<TodoList>,
  ) {}

  async create(createTodoListDto: CreateTodoListDto) {
    try {
      const createdTodoList = new this.todoListModel({
        ...createTodoListDto,
        startAt: createTodoListDto.startAt
          ? new Date(createTodoListDto.startAt)
          : null,
        dueAt: createTodoListDto.dueAt
          ? new Date(createTodoListDto.dueAt)
          : null,
        doneAt: createTodoListDto.doneAt
          ? new Date(createTodoListDto.doneAt)
          : null,
      });
      return await createdTodoList.save();
    } catch (error) {
      if (error instanceof Error.ValidationError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof Error.CastError) {
        throw new BadRequestException(`Invalid ID: ${error.value}`);
      }
      throw new InternalServerErrorException('Failed to create todo list');
    }
  }

  async findAll() {
    try {
      return await this.todoListModel.find().exec();
    } catch (error) {
      if (error instanceof Error.CastError) {
        throw new BadRequestException(`Invalid ID: ${error.value}`);
      }
      throw new InternalServerErrorException('Failed to fetch todo lists');
    }
  }

  async findOne(id: string) {
    try {
      const todoList = await this.todoListModel.findById(id).exec();
      if (!todoList) {
        throw new NotFoundException(`Todo list with ID ${id} not found`);
      }
      return todoList;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof Error.CastError) {
        throw new BadRequestException(`Invalid ID: ${error.value}`);
      }
      throw new InternalServerErrorException('Failed to fetch todo list');
    }
  }

  async update(id: string, updateTodoListDto: UpdateTodoListDto) {
    try {
      const updatedTodoList = await this.todoListModel
        .findByIdAndUpdate(id, updateTodoListDto, { new: true })
        .exec();
      if (!updatedTodoList) {
        throw new NotFoundException(`Todo list with ID ${id} not found`);
      }
      return updatedTodoList;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof Error.ValidationError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof Error.CastError) {
        throw new BadRequestException(`Invalid ID: ${error.value}`);
      }
      throw new InternalServerErrorException('Failed to update todo list');
    }
  }

  async remove(id: string) {
    try {
      const deletedTodoList = await this.todoListModel
        .findByIdAndDelete(id)
        .exec();
      if (!deletedTodoList) {
        throw new NotFoundException(`Todo list with ID ${id} not found`);
      }
      return deletedTodoList;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to delete todo list');
    }
  }

  async addChildTodo(id: string, childTodo: CreateTodoListDto) {
    try {
      const createdChildTodo = new this.todoListModel({
        ...childTodo,
        parentId: id,
        status: 'todo',
        startAt: null,
        dueAt: null,
        doneAt: null,
        priority: 'medium',
        order: childTodo.order,
      });
      return await createdChildTodo.save();
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof Error.ValidationError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof Error.CastError) {
        throw new BadRequestException(`Invalid ID: ${error.value}`);
      }
    }
  }
}
