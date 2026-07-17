import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

export const HelloWorldSchema = z.object({
  message: z.string(),
});

export const helloWorldContract = c.router({
  getHelloWorld: {
    method: 'GET',
    path: '/helloworld',
    responses: {
      200: HelloWorldSchema,
      404: z.object({ message: z.string() }),
    },
    summary: 'Get hello world',
  },
});
