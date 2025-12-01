import { GetEnvelopedFn } from '@envelop/core';
import { MaybePromise } from '@whatwg-node/promise-helpers';
import { ServerAdapterInitialContext } from '@whatwg-node/server';
import { OnResultProcess, ResultProcessorInput } from './plugins/types.js';
import { FetchAPI, GraphQLParams } from './types.js';
export declare function processResult<TServerContext>({ request, result, fetchAPI, onResultProcessHooks, serverContext, }: {
    request: Request;
    result: ResultProcessorInput;
    fetchAPI: FetchAPI;
    /**
     * Response Hooks
     */
    onResultProcessHooks: OnResultProcess<TServerContext>[];
    serverContext: TServerContext & ServerAdapterInitialContext;
}): MaybePromise<Response>;
export declare function processRequest({ params, enveloped, }: {
    params: GraphQLParams;
    enveloped: ReturnType<GetEnvelopedFn<unknown>>;
}): any;
