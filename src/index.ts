import path from 'path'
import {Command, flags} from '@oclif/command'
import SchemaConverter, {IWpSchemaRoot, TWpRestHttpMethods} from './schema-converter'
import readConfig from './utils'

class WpJsonSeven extends Command {
    static description = 'Convert WordPress JSON Schema REST endpoints to Json Schema 7'

    static flags = {
        output: flags.string({char: 'o', description: 'Specify the output directory, otherwise writes to stdout'}),

        route: flags.string({char: 'r', description: 'Specify route to convert', required: true}),

        method: flags.enum({
            char: 'm',
            description: 'Specify route to convert',
            default: 'POST' as TWpRestHttpMethods,
            options: ['POST', 'PUT', 'DELETE', 'GET'] as TWpRestHttpMethods[]
        }),

        insecure: flags.boolean({description: 'Request HTTPS site with self signed certificate', default: undefined}),

        version: flags.version({char: 'v'}),

        name: flags.string({char: 'e', description: 'Output schema entity base file name'}),

        help: flags.help({char: 'h'})
    }

    static args = [{name: 'file', description: 'Source schema file or WordPress URL'}]

    async run() {
        const config = readConfig()

        const {args, flags} = this.parse(WpJsonSeven)

        const sourceResource = args.file as string || config.wp_schema_site

        if (!sourceResource) {
            const prop: keyof typeof config = 'wp_schema_site'

            this.error(`Specify resource as argument otherwise use ".env" file with the entry "${prop}=http://example.com/wp-json/"`)

            return
        }

        const converter = new SchemaConverter()

        const schema: Partial<IWpSchemaRoot> = {}

        const insecure = (flags.insecure === undefined) ? config.wp_schema_insecure : flags.insecure

        if (sourceResource.match(/^https?:/)) {
            try {
                Object.assign(schema, await converter.readSchemaURL(sourceResource, {rejectUnauthorized: !insecure}))
            } catch (e) {
                e = e instanceof Error ? e.message : e

                return this.error(e)
            }
        }
        else {
            Object.assign(schema, await converter.readSchemaRootFile(args.file))
        }

        return this.generateSchemaToFile(schema as IWpSchemaRoot, flags.route, flags.method, flags.output, flags.name)
    }

    generateSchemaToFile(schema: IWpSchemaRoot, route: string, method: TWpRestHttpMethods, outputDir?: string, entityName?: string) {
        const converter = new SchemaConverter()

        entityName = entityName || converter.entityNameFromRoute(route)

        if (!entityName) {
            return new Error('Could not retrieve route name')
        }

        const routeSchemaArgs = converter.getSchemaRoute(schema, route, method)

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
