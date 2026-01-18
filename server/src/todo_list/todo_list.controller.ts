import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { TodoListService } from './todo_list.service';
import { CreateTodoListDto } from './dto/create-todo_list.dto';
import { UpdateTodoListDto } from './dto/update-todo_list.dto';

@Controller('todo-list')
export class TodoListController {
  constructor(private readonly todoListService: TodoListService) {}

  @Post()
  create(@Body() createTodoListDto: CreateTodoListDto) {
    return this.todoListService.create(createTodoListDto);
  }

  @Get()
  findAll() {
    return this.todoListService.findAll();
  }
  @Get('search')
  getSearchTodoList(@Query('query') query: string) {
    return this.todoListService.getSearchTodoList(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.todoListService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTodoListDto: UpdateTodoListDto,
  ) {
    return this.todoListService.update(id, updateTodoListDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.todoListService.remove(id);
  }

  @Post(':id/child')
  addChildTodo(
    @Param('id') id: string,
    @Body() createTodoListDto: CreateTodoListDto,
  ) {
    return this.todoListService.addChildTodo(id, createTodoListDto);
  }
}
