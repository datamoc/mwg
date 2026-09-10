export const gameData = {
	"schema": "0.1",
	"roots": [
		{
			"tag": "ai",
			"attributes": {
				"id": "basic",
				"strategy": "balanced",
				"target": "enemy",
				"difficulty": "1"
			},
			"children": [
				{
					"tag": "behavior",
					"attributes": {
						"id": "advance",
						"when": "enemy_visible",
						"action": "move_toward_enemy",
						"hook": "ai:advance"
					},
					"children": [],
					"location": {
						"file": "examples/mwl-content/content/ai.mwl",
						"line": 6,
						"column": 1
					},
					"gettext": []
				}
			],
			"location": {
				"file": "examples/mwl-content/content/ai.mwl",
				"line": 1,
				"column": 1
			},
			"gettext": []
		},
		{
			"tag": "game",
			"attributes": {
				"schema": "0.1",
				"title": "MWL content example",
				"data_root": "content",
				"start_scene": "opening"
			},
			"children": [],
			"location": {
				"file": "examples/mwl-content/content/game.mwl",
				"line": 1,
				"column": 1
			},
			"gettext": [
				"title"
			]
		},
		{
			"tag": "item",
			"attributes": {
				"id": "healing-herb",
				"name": "Healing herb",
				"stackable": "true",
				"weight": "0.1"
			},
			"children": [
				{
					"tag": "effect",
					"attributes": {
						"apply_to": "missing_hp_fraction",
						"add": "1"
					},
					"children": [],
					"location": {
						"file": "examples/mwl-content/content/items.mwl",
						"line": 6,
						"column": 1
					},
					"gettext": []
				}
			],
			"location": {
				"file": "examples/mwl-content/content/items.mwl",
				"line": 1,
				"column": 1
			},
			"gettext": [
				"name"
			]
		},
		{
			"tag": "map",
			"attributes": {
				"id": "training-ground",
				"name": "Training ground",
				"terrain": "Gg,Gg,Gg\\nGg,Ch,Gg\\nGg,Gg,Gg"
			},
			"children": [],
			"location": {
				"file": "examples/mwl-content/content/scenario.mwl",
				"line": 1,
				"column": 1
			},
			"gettext": [
				"name"
			]
		},
		{
			"tag": "event",
			"attributes": {
				"id": "opening",
				"on": "start"
			},
			"children": [
				{
					"tag": "message",
					"attributes": {
						"speaker": "scout",
						"text": "The training begins."
					},
					"children": [],
					"location": {
						"file": "examples/mwl-content/content/scenario.mwl",
						"line": 9,
						"column": 1
					},
					"gettext": [
						"text"
					]
				}
			],
			"location": {
				"file": "examples/mwl-content/content/scenario.mwl",
				"line": 6,
				"column": 1
			},
			"gettext": []
		},
		{
			"tag": "unit_type",
			"attributes": {
				"id": "scout",
				"name": "Scout",
				"image": "units/scout.png",
				"profile": "portraits/scout.png",
				"hitpoints": "12",
				"movement": "5"
			},
			"children": [],
			"location": {
				"file": "examples/mwl-content/content/units.mwl",
				"line": 1,
				"column": 1
			},
			"gettext": [
				"name"
			]
		}
	],
	"assets": [
		"portraits/scout.png",
		"units/scout.png"
	],
	"messages": [
		"Healing herb",
		"MWL content example",
		"Scout",
		"The training begins.",
		"Training ground"
	]
} as const;
