import { PartialType } from '@nestjs/mapped-types';
import { CreateTodoListDto } from './create-todo_list.dto';

export class UpdateTodoListDto extends PartialType(CreateTodoListDto) {}
