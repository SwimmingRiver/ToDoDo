import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class TodoList extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: false })
  description: string;

  @Prop({ required: true, default: 'todo', enum: ['todo', 'doing', 'done'] })
  status: 'todo' | 'doing' | 'done';

  @Prop({ required: false, default: null })
  startAt: Date;

  @Prop({ required: false, default: null })
  dueAt: Date;

  @Prop({ required: false, default: null })
  doneAt: Date;

  @Prop({ required: true, default: 'medium', enum: ['low', 'medium', 'high'] })
  priority: string;

  @Prop({ required: false, default: null })
  parentId: string;

  @Prop({ required: true, default: 0 })
  order: number;

  createdAt: Date;
  updatedAt: Date;
}

export const TodoListSchema = SchemaFactory.createForClass(TodoList);
TodoListSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    return ret;
  },
});
