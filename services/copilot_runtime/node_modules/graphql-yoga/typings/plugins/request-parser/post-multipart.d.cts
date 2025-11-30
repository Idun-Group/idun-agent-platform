import { MaybePromise } from '@whatwg-node/promise-helpers';
import { GraphQLParams } from '../../types.cjs';
export declare function isPOSTMultipartRequest(request: Request): boolean;
export declare function parsePOSTMultipartRequest(request: Request): MaybePromise<GraphQLParams>;
