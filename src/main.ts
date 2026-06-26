import { App, Notice, ObsidianProtocolData, Plugin, PluginSettingTab, Setting } from 'obsidian'
import {
    createEmptyGateOption,
    GateView,
    normalizeGateOption,
    openView,
    registerCodeBlockProcessor,
    registerGate,
    setupLinkConvertMenu,
    unloadView
} from './functions'
import { FirstPasskey, ModalEditGate, ModalListGates, setupInsertLinkMenu } from './passkeys'
import { GateFrameOption, GateFrameOptionType, PluginSetting } from './types'

const DEFAULT_SETTINGS: PluginSetting = {
    uuid: '',
    gates: {}
}

class SettingTab extends PluginSettingTab {
    plugin: URLAutoFillPlugin

    constructor(app: App, plugin: URLAutoFillPlugin) {
        super(app, plugin)
        this.plugin = plugin
    }

    async updateGate(gate: GateFrameOption) {
        await this.plugin.addGate(gate)
        this.display()
    }

    display(): void {
        const { containerEl } = this
        containerEl.empty()

        containerEl.createEl('button', { text: 'New passkey', cls: 'mod-cta' }).addEventListener('click', () => {
            new ModalEditGate(this.app, createEmptyGateOption(), this.updateGate.bind(this)).open()
        })

        containerEl.createEl('hr')

        const settingContainerEl = containerEl.createDiv('setting-container')

        for (const gateId in this.plugin.settings.gates) {
            const gate = this.plugin.settings.gates[gateId]
            const gateEl = settingContainerEl.createEl('div', {
                attr: {
                    'data-gate-id': gate.id,
                    class: 'url-autofill--setting--gate'
                }
            })

            new Setting(gateEl)
                .setName(gate.title)
                .setDesc(gate.url)
                .addButton((button) => {
                    button.setButtonText('Delete').onClick(async () => {
                        await this.plugin.removeGate(gateId)
                        gateEl.remove()
                    })
                })
                .addButton((button) => {
                    button.setButtonText('Edit').onClick(() => {
                        new ModalEditGate(this.app, gate, this.updateGate.bind(this)).open()
                    })
                })
        }
    }
}

export default class URLAutoFillPlugin extends Plugin {
    settings: PluginSetting

    async onload() {
        await this.loadSettings()
        await this.mayShowFirstPasskey()
        await this.initGates()
        this.addSettingTab(new SettingTab(this.app, this))
        this.registerCommands()
        this.registerProtocol()
        setupLinkConvertMenu(this)
        setupInsertLinkMenu(this)
        registerCodeBlockProcessor(this)
    }

    async mayShowFirstPasskey() {
        if (this.settings.uuid === '') {
            this.settings.uuid = this.generateUuid()
            await this.saveSettings()

            if (Object.keys(this.settings.gates).length === 0) {
                new FirstPasskey(this.app, createEmptyGateOption(), async (gate: GateFrameOption) => {
                    await this.addGate(gate)
                }).open()
            }
        }
    }

    private async initGates() {
        for (const gateId in this.settings.gates) {
            const gate = this.settings.gates[gateId]
            registerGate(this, gate)
        }

        registerGate(
            this,
            normalizeGateOption({
                id: 'temp-gate',
                title: 'Temp Gate',
                icon: 'globe',
                url: 'about:blank'
            })
        )
    }

    private registerCommands() {
        this.addCommand({
            id: `url-autofill-create-new`,
            name: `Create new site`,
            callback: async () => {
                new ModalEditGate(this.app, createEmptyGateOption(), async (gate: GateFrameOption) => {
                    await this.addGate(gate)
                }).open()
            }
        })

        this.addCommand({
            id: `url-autofill-list-gates`,
            name: `List sites`,
            hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'g' }],
            callback: async () => {
                new ModalListGates(this.app, this.settings.gates, async (gate: GateFrameOption) => {
                    await this.addGate(gate)
                }).open()
            }
        })
    }

    private registerProtocol() {
        this.registerObsidianProtocolHandler('urlautofill', this.handleCustomProtocol.bind(this))
    }

    getGateOptionFromProtocolData(data: ObsidianProtocolData): GateFrameOption | undefined {
        const { title, url, id, position } = data

        let targetGate: GateFrameOption | undefined

        if (id && this.settings.gates[id]) {
            targetGate = this.settings.gates[id]
        } else {
            targetGate = Object.values(this.settings.gates).find(
                (gate) => (title && gate.title.toLowerCase() === title.toLowerCase()) || (url && gate.url.toLowerCase() === url.toLowerCase())
            )
        }

        if (!targetGate) {
            targetGate = createEmptyGateOption()
        }

        if (url) {
            targetGate.url = url
        }

        if (position) {
            targetGate.position = position as GateFrameOptionType
        }

        return targetGate
    }

    findGateBy(field: 'title' | 'url', value: string): GateFrameOption | undefined {
        return Object.values(this.settings.gates).find((gate) => gate[field].toLowerCase() === value.toLowerCase())
    }

    async handleCustomProtocol(data: ObsidianProtocolData) {
        const targetGate = this.getGateOptionFromProtocolData(data)
        if (targetGate === undefined) {
            if (!data.url) {
                new Notice('Missing url parameter')
                return
            }
        }

        const gate = await openView(
            this.app.workspace,
            targetGate?.id || 'temp-gate',
            targetGate?.position,
            targetGate?.openMode ?? 'tab'
        )
        const gateView = gate.view as GateView
        gateView?.onFrameReady(() => {
            gateView.setUrl(data.url)
        })
    }

    async addGate(gate: GateFrameOption) {
        const normalizedGate = normalizeGateOption(gate)

        if (!this.settings.gates.hasOwnProperty(normalizedGate.id)) {
            registerGate(this, normalizedGate)
        } else {
            new Notice('This change will take effect after you reload Obsidian.')
        }

        this.settings.gates[normalizedGate.id] = normalizedGate

        await this.saveSettings()
    }

    async removeGate(gateId: string) {
        if (!this.settings.gates[gateId]) {
            new Notice('Gate not found')
            return
        }

        const gate = this.settings.gates[gateId]

        await unloadView(this.app.workspace, gate)
        delete this.settings.gates[gateId]
        await this.saveSettings()
        new Notice('This change will take effect after you reload Obsidian.')
    }

    async loadSettings() {
        this.settings = await this.loadData()
        this.settings = {
            ...DEFAULT_SETTINGS,
            ...this.settings
        }

        if (!this.settings.gates) {
            this.settings.gates = {}
        }

        for (const gateId in this.settings.gates) {
            this.settings.gates[gateId] = normalizeGateOption(this.settings.gates[gateId])
        }
    }

    async saveSettings() {
        await this.saveData(this.settings)
    }

    private generateUuid() {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    }
}
