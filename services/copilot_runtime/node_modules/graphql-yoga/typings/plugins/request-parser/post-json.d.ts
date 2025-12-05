import { MaybePromise } from '@whatwg-node/promise-helpers';
import { GraphQLParams } from '../../types.js';
export declare function isPOSTJsonRequest(request: Request): boolean;
export declare function parsePOSTJsonRequest(request: Request): MaybePromise<GraphQLParams>;
