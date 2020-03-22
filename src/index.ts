import path from 'path'
import {Command, flags} from '@oclif/command'
import SchemaConverter, {IWpSchemaRoot} from './schema-converter'

class WpJsonSeven extends Command {
    static description = 'Convert WordPress JSON Schema REST endpoints to Json Schema 7'

    static flags = {
        output: flags.string({char: 'o', description: 'Specify the output directory, otherwise writes to stdout'}),

        route: flags.string({char: 'r', description: 'Specify route to convert', required: true}),

        method: flags.enum({
            char: 'm',
            description: 'Specify route to convert',
            default: 'POST',
            options: ['POST', 'PUT', 'DELETE', 'GET']
        }),

        insecure: flags.boolean({description: 'Request HTTPS site with self signed certificate', default: false}),

        version: flags.version({char: 'v'}),

        help: flags.help({char: 'h'})
    }

    static args = [{name: 'file', description: 'Source schema file or WordPress URL'}]

    async run() {
        const {args, flags} = this.parse(WpJsonSeven)

        const insecure = flags.insecure || false

        const sourceResource = args.file as string

        const converter = new SchemaConverter()

        const schema: Partial<IWpSchemaRoot> = {}

        if (sourceResource.match(/^https?:/)) {
            try {
                Object.assign(schema, await converter.readSchemaURL(sourceResource, {rejectUnauthorized: !flags.insecure}))
            } catch (e) {
                e = e instanceof Error ? e.message : e

                return this.error(e)
            }
        }
        else {
            Object.assign(schema, await converter.readSchemaRootFile(args.file))
        }

        return this.generateSchemaToFile(schema as IWpSchemaRoot, flags.route, flags.method, flags.output)
    }

    generateSchemaToFile(schema: IWpSchemaRoot, route: string, method: string, outputDir?: string) {
        const converter = new SchemaConverter()

        const entityName = converter.entityNameFromRoute(route)

        if (!entityName) {
            return new Error('Could not retrieve route name')
        }

        const routeSchemaArgs = converter.getSchemaRoute(schema, route)

        if (!routeSchemaArgs) {
            return new Error('No route args found')
        }

        const schema7 = converter.generateRouteArgsSchema(routeSchemaArgs, entityName)

        if (outputDir) {
            return converter.writeOutputSchemaFile(path.join(outputDir, `${entityName}.schema.json`), schema7)
        }
        else {
            this.log(converter.jsonPrettyStringify(schema7))
        }
    }
}

export = WpJsonSeven
