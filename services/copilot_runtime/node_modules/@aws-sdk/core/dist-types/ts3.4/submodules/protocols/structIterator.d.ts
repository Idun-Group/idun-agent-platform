import { NormalizedSchema } from "@smithy/core/schema";
type SourceObject = Record<string, any>;
export declare function serializingStructIterator(
  ns: NormalizedSchema,
  sourceObject: SourceObject
): Generator<any[], void, unknown>;
export declare function deserializingStructIterator(
  ns: NormalizedSchema,
  sourceObject: SourceObject,
  nameTrait?: "xmlName" | "jsonName" | false
): Generator<any[], void, unknown>;
export {};
