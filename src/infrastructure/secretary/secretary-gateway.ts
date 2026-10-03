import { randomUUID } from 'node:crypto';
import jsonRpc, { type JSONRPCErrorResponse } from 'request-json-rpc2';
import type { paths } from '../../../api.d.ts';

type RpcMethod = {
  [Path in keyof paths]: Path extends `/rpc/${infer Method}` ? Method : never;
}[keyof paths];
type RpcOperation<Method extends RpcMethod> = paths[`/rpc/${Method}`]['post'];
type RpcParameters<Method extends RpcMethod> =
  RpcOperation<Method>['requestBody']['content']['application/json']['params'];
type RpcSuccess<Method extends RpcMethod> = RpcOperation<Method>['responses'][200]['content']['application/json'] & {
  error?: never;
};
type RpcResponse<Method extends RpcMethod> = RpcSuccess<Method> | JSONRPCErrorResponse;
type RpcInput<Method extends RpcMethod> = {
  method: Method;
  params: RpcParameters<NoInfer<Method>>;
  accessToken: string;
  geolocation?: string;
  timezone?: string;
};
type TaskResponse = paths['/tasks/{id}']['get']['responses'][200]['content']['application/json'];
type QueryOperation = paths['/tasks/query']['get'];

export class SecretaryGateway {
  host: string;

  constructor(host: string) {
    this.host = host;
  }

  async getTask(input: {
    taskId: paths['/tasks/{id}']['get']['parameters']['path']['id'];
    accessToken: string;
  }): Promise<TaskResponse> {
    const response = await fetch(`${this.host}/tasks/${encodeURIComponent(String(input.taskId))}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${input.accessToken}`,
      },
    });
    if (!response.ok) {
      const error = new Error('Ошибка Task') as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async queryEvents({
    query,
    accessToken,
    limit = 5,
  }: {
    query: QueryOperation['parameters']['query']['query'];
    accessToken: string;
    limit?: QueryOperation['parameters']['query']['limit'];
  }): Promise<QueryOperation['responses'][200]['content']['application/json']> {
    const url = new URL(`${this.host}/tasks/query`);
    url.searchParams.set('query', query);
    url.searchParams.set('limit', String(limit));
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      throw new Error('Ошибка поиска событий');
    }
    return response.json();
  }

  call<Method extends RpcMethod>(
    input: RpcInput<Method> & { accept?: 'application/json' },
  ): Promise<RpcResponse<Method>>;
  call<Method extends RpcMethod>(
    input: RpcInput<Method> & { accept: string },
  ): Promise<(Omit<RpcSuccess<Method>, 'result'> & { result: unknown }) | JSONRPCErrorResponse>;
  call<Method extends RpcMethod>(input: RpcInput<Method> & { accept?: string }): Promise<RpcResponse<Method>> {
    return jsonRpc({
      url: `${this.host}/rpc`,
      body: {
        jsonrpc: '2.0',
        id: randomUUID(),
        method: input.method,
        params: input.params,
      },
      headers: {
        Accept: input.accept ?? 'application/json',
        Authorization: `Bearer ${input.accessToken}`,
        Geolocation: input.geolocation,
        Timezone: input.timezone,
      },
    }) as Promise<RpcResponse<Method>>;
  }
}
