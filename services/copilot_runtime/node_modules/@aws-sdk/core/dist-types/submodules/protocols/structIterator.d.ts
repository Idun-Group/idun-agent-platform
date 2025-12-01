import { NormalizedSchema } from "@smithy/core/schema";
/**
 * @internal
 */
type SourceObject = Record<string, any>;
/**
 * For serialization use only.
 * @internal
 *
 * @param ns - normalized schema object.
 * @param sourceObject - source object from serialization.
 */
export declare function serializingStructIterator(ns: NormalizedSchema, sourceObject: SourceObject): Generator<any[], void, unknown>;
/**
 * For deserialization use only.
 * Yields a subset of NormalizedSchema::structIterator matched to the source object keys.
 * This is a performance optimization to avoid creation of NormalizedSchema member
 * objects for members that are undefined in the source data object but may be numerous
 * in the schema/model.
 * @internal
 *
 * @param ns - normalized schema object.
 * @param sourceObject - source object from deserialization.
 * @param nameTrait - xmlName or jsonName trait to look for.
 */
export declare function deserializingStructIterator(ns: NormalizedSchema, sourceObject: SourceObject, nameTrait?: "xmlName" | "jsonName" | false): Generator<any[], void, unknown>;
export {};
