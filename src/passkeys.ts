import { App, Editor, getIcon, Menu, Modal, Setting } from 'obsidian'
import { createEmptyGateOption, createFormEditGate, normalizeGateOption, openView } from './functions'
import { GateFrameOption } from './types'

export class FirstPasskey extends Modal {
    gateOptions: GateFrameOption
    onSubmit: (result: GateFrameOption) => void

    constructor(app: App, gateOptions: GateFrameOption, onSubmit: (result: GateFrameOption) => void) {
        super(app)
        this.onSubmit = onSubmit
        this.gateOptions = gateOptions
    }

    onOpen() {
        const { contentEl } = this

        this.modalEl.addClass('url-autofill--passkey-modal')
        this.titleEl.setText('Welcome, Create your first passkey !')

        createFormEditGate(contentEl, this.gateOptions, (result) => {
            this.onSubmit(result)
            this.close()
        }, 'Create passkey')
    }
    onClose() {
        this.contentEl.empty()
    }
}

export class ModalEditGate extends Modal {
    gateOptions: GateFrameOption
    onSubmit: (result: GateFrameOption) => void

    constructor(app: App, gateOptions: GateFrameOption, onSubmit: (result: GateFrameOption) => void) {
        super(app)
        this.onSubmit = onSubmit
        this.gateOptions = gateOptions
    }

    onOpen() {
        const { contentEl } = this
        contentEl.createEl('h3', { text: 'URL AutoFill' })
        createFormEditGate(contentEl, this.gateOptions, (result) => {
            this.onSubmit(result)
            this.close()
        })
    }

    onClose() {
        this.contentEl.empty()
    }
}

export class ModalInsertLink extends Modal {
    onSubmit: (result: GateFrameOption) => void

    constructor(app: App, onSubmit: (result: GateFrameOption) => void) {
        super(app)
        this.onSubmit = onSubmit
    }

    onOpen() {
        this.titleEl.setText('Insert Link')
        this.createFormInsertLink()
    }

    onClose() {
        this.contentEl.empty()
    }

    createFormInsertLink() {
        let gateOptions = createEmptyGateOption()
        new Setting(this.contentEl)
            .setName('URL')
            .setClass('url-autofill--form-field')
            .addText((text) =>
                text.setPlaceholder('https://example.com').onChange(async (value) => {
                    gateOptions.url = value
                })
            )

        new Setting(this.contentEl)
            .setName('Title')
            .setClass('url-autofill--form-field')
            .addText((text) =>
                text.onChange(async (value) => {
                    gateOptions.title = value
                })
            )

        new Setting(this.contentEl).addButton((btn) =>
            btn
                .setButtonText('Insert Link')
                .setCta()
                .onClick(async () => {
                    gateOptions = normalizeGateOption(gateOptions)
                    this.onSubmit(gateOptions)
                })
        )
    }
}

export class ModalListGates extends Modal {
    gates: Record<string, GateFrameOption>
    onSubmit: (result: GateFrameOption) => void

    constructor(app: App, gates: Record<string, GateFrameOption>, onSubmit: (result: GateFrameOption) => void) {
        super(app)
        this.onSubmit = onSubmit
        this.gates = gates
    }

    onOpen() {
        const { contentEl } = this

        for (const gateId in this.gates) {
            const gate = this.gates[gateId]
            const container = contentEl.createEl('div', {
                cls: 'url-autofill--quick-list-item'
            })

            if (!gate.icon.startsWith('<svg')) {
                const iconSvg = getIcon(gate.icon) ?? getIcon('link-external')!
                iconSvg.classList.add('svg-icon')
                container.appendChild(iconSvg)
            } else {
                const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
                svgEl.classList.add('svg-icon')
                svgEl.innerHTML = gate.icon
                container.appendChild(svgEl)
            }

            container.createEl('span', { text: gate.title })

            container.addEventListener('click', async () => {
                await openView(this.app.workspace, gate.id, gate.position)
                this.close()
            })
        }
    }
}

export const setupInsertLinkMenu = (plugin: { app: App; registerEvent: (event: unknown) => void }) => {
    plugin.registerEvent(
        plugin.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
            menu.addItem((item) => {
                item.setTitle('Insert Gate Link').onClick(async () => {
                    const modal = new ModalInsertLink(plugin.app, async (gate: GateFrameOption) => {
                        const gateLink = `[${gate.title}](obsidian://urlautofill?title=${encodeURIComponent(gate.title)}&url=${encodeURIComponent(gate.url)})`
                        editor.replaceSelection(gateLink)
                        modal.close()
                    })
                    modal.open()
                })
            })
        })
    )
}
