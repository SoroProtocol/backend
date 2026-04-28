// GraphQL resolver — requires @nestjs/graphql and graphql-ws
// Full implementation tracked in issue #19

import { Resolver, Query, Args } from '@nestjs/graphql';
import { StreamsService }        from './streams.service';

@Resolver('Stream')
export class StreamsResolver {
  constructor(private readonly streams: StreamsService) {}

  @Query('streams')
  async getStreams(@Args('address') address?: string) {
    return this.streams.findAll(address);
  }

  @Query('stream')
  async getStream(@Args('id') id: string) {
    return this.streams.findOne(id);
  }
}
