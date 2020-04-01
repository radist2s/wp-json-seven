import {expect} from 'chai'
import * as path from 'path'
import {readFileSync} from 'fs'
import SchemaConverter, {IWpSchemaRoot, IWpSchema} from '../src/schema-converter'
import {JSONSchema7} from 'json-schema'
import readConfig from '../src/utils'

const config = readConfig()

describe('Read schema from WP JSON REST', async function () {
    const converter = new SchemaConverter()

    it('should request wp schema by URL', async function () {
        if (!expect(config.wp_schema_site).has.to.exist || !config.wp_schema_site) {
            return
        }

        const rejectUnauthorized = (config.wp_schema_insecure !== undefined) ? !config.wp_schema_insecure : undefined

        const document = await converter.readSchemaURL(config.wp_schema_site, {rejectUnauthorized})

        expect(document).to.has.property('namespaces')
    })
})

describe('Generate Schema', async function () {
    const inputWpSchemaFilePath = path.join(__dirname, 'fixtures/wp-wc-schema.json')
    const outputJsonSchema7FilePath = path.join(__dirname, 'output/wp-wc.schema.json')

    const converter = new SchemaConverter()
    const wpRootSchema: Partial<IWpSchemaRoot> = {}
    const wpRouteArgs: { [key: string]: IWpSchema } = {}
    const jsonSchema7: JSONSchema7 = {}

    it('should read file', function () {
        Object.assign(wpRootSchema, converter.readSchemaRootFile(inputWpSchemaFilePath))

        expect(wpRootSchema).to.not.be.empty
    })

    it('should find GET route', function () {
        const schema = converter.getSchemaRoute(converter.readSchemaRootFile(inputWpSchemaFilePath) as IWpSchemaRoot, '/wc/v3/products', 'GET')

        expect(schema).to.not.be.empty
    })

    it('should find POST route', function () {
        Object.assign(wpRouteArgs, converter.getSchemaRoute(wpRootSchema as IWpSchemaRoot, '/wc/v3/products/(?P<id>[\\d]+)', 'POST'))

        expect(wpRouteArgs).to.not.be.empty
    })

    it('should generate schema', function () {
        Object.assign(jsonSchema7, converter.generateRouteArgsSchema(wpRouteArgs, 'product'))

        expect(jsonSchema7).to.not.be.empty

        console.log(JSON.stringify(jsonSchema7, null, '\t'))
    })

    it('should save file', function () {
        converter.writeOutputSchemaFile(outputJsonSchema7FilePath, jsonSchema7)

        const fileContent = readFileSync(outputJsonSchema7FilePath).toString('utf-8')

        expect(JSON.parse(fileContent)).to.eql(jsonSchema7)
    })
})
