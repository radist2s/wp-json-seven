import {config} from 'dotenv'

type ConfigSchema = Partial<{ wp_schema_site: string, wp_schema_insecure: boolean }>

export default function readConfig(): ConfigSchema {
    const configRaw = config().parsed as Partial<Record<keyof ConfigSchema, 'string'>>

    if (!configRaw) {
        return {}
    }

    const {wp_schema_insecure: https_insecure_raw, ...confRawRest} = configRaw

    const https_insecure = (https_insecure_raw === undefined) ? undefined : Boolean(JSON.parse(https_insecure_raw))

    return Object.assign(confRawRest, {wp_schema_insecure: https_insecure})
}
