import * as Core from "../core.js";
import { APIResource } from "../resource.js";
import * as ModelsAPI from "./models.js";
export declare class Models extends APIResource {
    /**
     * Get a specific model
     */
    retrieve(model: string, options?: Core.RequestOptions): Core.APIPromise<Model>;
    /**
     * get all available models
     */
    list(options?: Core.RequestOptions): Core.APIPromise<ModelListResponse>;
    /**
     * Delete a model
     */
    delete(model: string, options?: Core.RequestOptions): Core.APIPromise<ModelDeleted>;
}
/**
 * Describes an OpenAI model offering that can be used with the API.
 */
export interface Model {
    /**
     * The model identifier, which can be referenced in the API endpoints.
     */
    id: string;
    /**
     * The Unix timestamp (in seconds) when the model was created.
     */
    created: number;
    /**
     * The object type, which is always "model".
     */
    object: 'model';
    /**
     * The organization that owns the model.
     */
    owned_by: string;
}
export interface ModelDeleted {
    id: string;
    deleted: boolean;
    object: string;
}
export interface ModelListResponse {
    data: Array<Model>;
    object: 'list';
}
export declare namespace Models {
    export import Model = ModelsAPI.Model;
    export import ModelDeleted = ModelsAPI.ModelDeleted;
    export import ModelListResponse = ModelsAPI.ModelListResponse;
}
//# sourceMappingURL=models.d.ts.map