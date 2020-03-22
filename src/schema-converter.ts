import {readFileSync, writeFileSync} from 'fs'
import {JSONSchema7, JSONSchema7TypeName} from 'json-schema'
import {intersection as _intersection} from 'lodash'
import request from 'request'

type TWpRestHttpMethods = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface IWpSchemaRoot {
    name: string
    description: string
    url: string
    home: string
    gmt_offset: number
    timezone_string: string
    namespaces: string[]
    authentication: any[]
    routes: { [key: string]: IWpSchemaRoute }
}

export interface IWpSchemaRoute {
    namespace: string;
    methods: TWpRestHttpMethods[]
    endpoints: { methods: TWpRestHttpMethods[], args: { [key: string]: IWpSchema } }[]
}

export interface IWpSchema {
    required?: boolean
    description?: string
    enum?: string[]
    type?: TSourceTypes
    items?: IWpSchema
    default?: string
    properties?: { [key: string]: IWpSchema }
    context?: ('view' | 'edit')[]
    readonly?: boolean
}

type TSourceTypes = 'string' | 'integer' | 'date-time' | 'time' | 'date' | 'array' | 'object' | 'mixed'

function sourceTypeToSchema7(type?: TSourceTypes): Pick<JSONSchema7, 'type' | 'format'> {
    type = type || 'mixed'

    const convertingTypes: { [key in Extract<TSourceTypes, 'date-time' | 'time' | 'date' | 'mixed'>]: Pick<JSONSchema7, 'type' | 'format'> } = {
        'date-time': {type: 'string', format: 'date-time'},
        'time': {type: 'string', format: 'time'},
        'date': {type: 'string', format: 'date'},
        'mixed': {type: ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']}
    }

    if (convertingTypes.hasOwnProperty(type)) {
        return convertingTypes[type as keyof typeof convertingTypes]
    }

    return {type: type as JSONSchema7TypeName}
}

export default class SchemaConverter {
    readSchemaURL(url: string, options?: Omit<request.CoreOptions, 'json' | 'headers'>) {
        if (!url.match(/\/wp-json/i)) {
            url = [url.replace(/\/$/, ''), 'wp-json/'].join('/')
        }

        const headers = {
            // Fake any user agent
            'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; WOW64; Trident/7.0; rv:11.0) like Gecko'
        }

        return new Promise<IWpSchemaRoot>(function (resolve, reject) {
            request(url, Object.assign({json: true, headers}, options), (err, res, body) => {
                if (err) {
                    return reject(err)
                }

                if (!body || !Object.keys(body).length) {
                    return reject(new Error('No JSON data found'))
                }

                return resolve(body)
            })
        })
    }

    readSchemaRootFile(file: string): IWpSchemaRoot {
        return JSON.parse(readFileSync(file).toString('utf-8'))
    }

    getSchemaRoute(wpSchemaRoot: IWpSchemaRoot, route: string, methods: TWpRestHttpMethods | TWpRestHttpMethods[] = 'POST') {
        if (!wpSchemaRoot || !wpSchemaRoot.routes) {
            throw new Error(`Route [${route}] is not found in provided WP Schema`)
        }

        const routeConfig = wpSchemaRoot.routes[route]

        methods = methods instanceof Array ? methods : [methods]

        const routeMatchMethods = _intersection(routeConfig.methods, methods)

        if (!routeMatchMethods.length) {
            return undefined
        }

        for (const endpoint of routeConfig.endpoints) {
            if (!_intersection(endpoint.methods, methods).length) {
                continue
            }

            return endpoint.args
        }

        return undefined
    }

    generateRouteArgsSchema(sourceSchema: { [key: string]: IWpSchema }, schemaNameSpace: string) {
        const schema7: JSONSchema7 = {
            $id: `${schemaNameSpace}.schema.json`,
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            properties: {}
        }

        for (const [property, source] of Object.entries(sourceSchema)) {
            this.wpSchemaTo7(property, source, schema7)
        }

        return schema7
    }

    writeOutputSchemaFile(file: string, schema: JSONSchema7) {
        return writeFileSync(file, this.jsonPrettyStringify(schema))
    }

    jsonPrettyStringify(data: object) {
        return JSON.stringify(data, null, '    ')
    }

    wpSchemaTo7(property: string, source: IWpSchema, docSchema?: JSONSchema7) {
        docSchema = docSchema || {}
        docSchema.properties = docSchema.properties || {}

        const nodeSchema: JSONSchema7 = {}

        docSchema.properties[property] = nodeSchema

        // Apply types
        Object.assign(nodeSchema, sourceTypeToSchema7(source.type))

        if (source.description) {
            nodeSchema.description = source.description
        }

        if (source.required) {
            docSchema.required = nodeSchema.required || []
            docSchema.required.push(property)
        }

        if (source.default) {
            nodeSchema.default = source.default
        }

        if (source.enum) {
            nodeSchema.enum = source.enum.slice()

            if (nodeSchema.default === undefined && nodeSchema.enum[0] !== undefined) {
                nodeSchema.default = nodeSchema.enum[0]
            }
        }

        if (source.readonly) {
            nodeSchema.readOnly = source.readonly
        }

        if (source.items) {
            nodeSchema.items = nodeSchema.items || {}

            if (source.items.type === 'object' && source.type === 'array') {
                const fragSchema: JSONSchema7 = Object.assign(sourceTypeToSchema7(source.items.type))

                if (source.items.properties) {
                    for (const [item, itemSourceSchema] of Object.entries(source.items.properties)) {
                        this.wpSchemaTo7(item, itemSourceSchema, fragSchema)
                    }
                }

                const {definitions, ...schemaFragWithoutDefinitions} = fragSchema

                docSchema.definitions = docSchema.definitions || {}
                docSchema.definitions[property] = Object.assign(schemaFragWithoutDefinitions, definitions)

                ;(nodeSchema.items as JSONSchema7).$ref = `#/definitions/${property}`
            }
            else {
                Object.assign(nodeSchema.items, sourceTypeToSchema7(source.items.type))
            }
        }

        return docSchema
    }

    entityNameFromRoute(route: string) {
        const parts = route
            .split('/')
            .filter(path => path.trim())

        return parts[parts.findIndex(path => path.indexOf('(') !== -1) - 1] || parts[parts.length - 1]
    }
}