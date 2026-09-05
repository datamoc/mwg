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
			greeting: 'مرحباً يا {name}!',
			gems: { one: 'جوهرة {count}', other: '{count} جواهر' },
		},
	},
};

class I18nScene extends Scene {
	private greeting!: Label;
	private gemCount = 1;
	private gems!: Label;

	override create(): void {
		I18n.setBase(CATALOGS.en);
		I18n.setActive(CATALOGS.en);

		const game = Game.current;
		const centerX = game.width / 2;

		this.greeting = new Label({ text: '', color: theme().color.text, size: 22, align: 'center' });
		this.greeting.anchor.set(0.5);
		this.greeting.position.set(centerX, 50);
		this.stage.addChild(this.greeting);

		this.gems = new Label({ text: '', color: theme().color.textDim, size: 16, align: 'center' });
		this.gems.anchor.set(0.5);
		this.gems.position.set(centerX, 90);
		this.stage.addChild(this.gems);

		let x = centerX - 165;
		for (const locale of Object.keys(CATALOGS)) {
			const button = new Button({ width: 100, height: 30, text: locale, onClick: () => this.switchTo(locale) });
			button.position.set(x, 140);
			this.stage.addChild(button);
			x += 110;
		}

		const addGem = new Button({
			width: 220,
			height: 30,
			text: '+1 gem (watch the plural)',
			onClick: () => {
				this.gemCount += 1;
				this.refresh();
			},
		});
		addGem.position.set(centerX - 110, 190);
		this.stage.addChild(addGem);

		this.refresh();
	}

	private switchTo(localeKey: string): void {
		const catalog = CATALOGS[localeKey];
		I18n.setActive(catalog);
		//every widget mwg ships already reads theme.direction; a real game sets this once,
		//here, rather than each screen guessing its own layout direction
		setTheme({ ...theme(), direction: I18n.direction() });
		this.refresh();
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
