import { Game, Scene } from '../../src/core/index.ts';
import * as I18n from '../../src/i18n/index.ts';
import { Button, Label, setTheme, theme } from '../../src/ui/index.ts';

/**
 * `mwg/i18n` on its own: `t()` resolving a key against whichever `Catalog` is `setActive`,
 * `{token}` interpolation, plural forms picked by `Intl.PluralRules`, and right-to-left
 * layout - `theme.direction` is a game's own glue code, set from `I18n.direction()` on every
 * language switch, which is exactly what this does.
 */

const CATALOGS: Record<string, I18n.Catalog> = {
	en: {
		locale: 'en',
		direction: 'ltr',
		messages: {
			greeting: 'Hello, {name}!',
			gems: { one: '{count} gem', other: '{count} gems' },
		},
	},
	fr: {
		locale: 'fr',
		direction: 'ltr',
		messages: {
			greeting: "Bonjour, {name}!",
			gems: { one: '{count} gemme', other: '{count} gemmes' },
		},
	},
	ar: {
		locale: 'ar',
		direction: 'rtl',
		messages: {
			//"mwg" stays Latin/left-to-right inside this right-to-left sentence on its own:
			//canvas text rendering applies the Unicode Bidi Algorithm the same way a browser's
			//own text does, so an embedded LTR run needs no bidi handling from mwg itself.
			greeting: 'مرحبًا {name}!',
			gems: { one: '{count} جوهرة', other: '{count} جواهر' },
		},
	},
};

class I18nScene extends Scene {
	private greeting!: Label;
	private gemCount = 1;
	private gems!: Label;
	private localeButtons: Button[] = [];
	private centerX = 0;

	override create(): void {
		I18n.setBase(CATALOGS.en);
		I18n.setActive(CATALOGS.en);

		const game = Game.current;
		this.centerX = game.width / 2;

		this.greeting = new Label({ text: '', color: theme().color.text, size: 22, align: 'center' });
		this.greeting.anchor.set(0.5);
		this.greeting.position.set(this.centerX, 50);
		this.stage.addChild(this.greeting);

		this.gems = new Label({ text: '', color: theme().color.textDim, size: 16, align: 'center' });
		this.gems.anchor.set(0.5);
		this.gems.position.set(this.centerX, 90);
		this.stage.addChild(this.gems);

		for (const locale of Object.keys(CATALOGS)) {
			const button = new Button({ width: 100, height: 30, text: locale, onClick: () => this.switchTo(locale) });
			button.position.y = 140;
			this.stage.addChild(button);
			this.localeButtons.push(button);
		}
		this.layoutLocaleButtons(false);

		const addGem = new Button({
			width: 220,
			height: 30,
			text: '+1 gem (watch the plural)',
			onClick: () => {
				this.gemCount += 1;
				this.refresh();
			},
		});
		addGem.position.set(this.centerX - 110, 190);
		this.stage.addChild(addGem);

		this.refresh();
	}

	private switchTo(localeKey: string): void {
		const catalog = CATALOGS[localeKey];
		I18n.setActive(catalog);
		//every widget mwg ships already reads theme.direction; a real game sets this once,
		//here, rather than each screen guessing its own layout direction
		const rtl = I18n.direction() === 'rtl';
		setTheme({ ...theme(), direction: rtl ? 'rtl' : 'ltr' });
		this.layoutLocaleButtons(rtl);
		this.refresh();
	}

	//mirrors the button row so switching to a right-to-left language is visible, not just a
	//theme flag nothing on screen reacts to
	private layoutLocaleButtons(rtl: boolean): void {
		const count = this.localeButtons.length;
		this.localeButtons.forEach((button, i) => {
			const slot = rtl ? count - 1 - i : i;
			button.position.x = this.centerX - 165 + slot * 110;
		});
	}

	private refresh(): void {
		this.greeting.setText(I18n.t('greeting', { name: 'mwg' }));
		this.gems.setText(I18n.t('gems', { count: this.gemCount }));
	}
}

async function main(): Promise<void> {
	const game = new Game({ canvas: document.getElementById('game') as HTMLCanvasElement, background: 0x101018 });
	await game.start(I18nScene);
}

main().catch((error) => {
	console.error(error);
	document.body.insertAdjacentHTML('afterbegin', `<pre style="color:#c66;font:12px monospace;padding:16px">${String(error?.stack ?? error)}</pre>`);
});
