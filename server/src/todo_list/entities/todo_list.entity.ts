import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class TodoList extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: false })
  description: string;

  @Prop({ required: true, default: 'pending' })
  status: string;
}

export const TodoListSchema = SchemaFactory.createForClass(TodoList);
