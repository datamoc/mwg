export const gameData = {
	"schema": "0.1",
	"roots": [
		{
			"tag": "game",
			"attributes": {
				"schema": "0.1",
				"title": "Creature battle"
			},
			"children": [],
			"location": {
				"file": "examples/battle/content/battle.mwl",
				"line": 1,
				"column": 1
			},
			"gettext": [
				"title"
			]
		},
		{
			"tag": "monster",
			"attributes": {
				"id": "slime",
				"name": "slime",
				"types": "ooze",
				"hp": "24",
				"attack": "6",
				"defense": "5",
				"speed": "5"
			},
			"children": [],
			"location": {
				"file": "examples/battle/content/battle.mwl",
				"line": 5,
				"column": 1
			},
			"gettext": [
				"name"
			]
		},
		{
			"tag": "monster",
			"attributes": {
				"id": "wolf",
				"name": "wolf",
				"types": "beast",
				"hp": "20",
				"attack": "7",
				"defense": "4",
				"speed": "6"
			},
			"children": [],
			"location": {
				"file": "examples/battle/content/battle.mwl",
				"line": 14,
				"column": 1
			},
			"gettext": [
				"name"
			]
		},
		{
			"tag": "monster",
			"attributes": {
				"id": "royal_slime",
				"name": "royal slime",
				"types": "ooze",
				"hp": "36",
				"attack": "10",
				"defense": "8",
				"speed": "6"
			},
			"children": [],
			"location": {
				"file": "examples/battle/content/battle.mwl",
				"line": 23,
				"column": 1
			},
			"gettext": [
				"name"
			]
		},
		{
			"tag": "battle_move",
			"attributes": {
				"id": "tackle",
				"type": "normal",
				"target": "single-enemy",
				"power": "5"
			},
			"children": [],
			"location": {
				"file": "examples/battle/content/battle.mwl",
				"line": 32,
				"column": 1
			},
			"gettext": []
		},
		{
			"tag": "battle_move",
			"attributes": {
				"id": "ooze_slam",
				"type": "ooze",
				"target": "single-enemy",
				"power": "7"
			},
			"children": [],
			"location": {
				"file": "examples/battle/content/battle.mwl",
				"line": 38,
				"column": 1
			},
			"gettext": []
		},
		{
			"tag": "battle_move",
			"attributes": {
				"id": "bite",
				"type": "beast",
				"target": "single-enemy",
				"power": "8"
			},
			"children": [],
			"location": {
				"file": "examples/battle/content/battle.mwl",
				"line": 44,
				"column": 1
			},
			"gettext": []
		},
		{
			"tag": "battle_move",
			"attributes": {
				"id": "howl",
				"type": "beast",
				"target": "single-enemy",
				"power": "4"
			},
			"children": [],
			"location": {
				"file": "examples/battle/content/battle.mwl",
				"line": 50,
				"column": 1
			},
			"gettext": []
		},
		{
			"tag": "type_matchup",
			"attributes": {
				"attacker": "ooze",
				"defender": "beast",
				"multiplier": "1.5"
			},
			"children": [],
			"location": {
				"file": "examples/battle/content/battle.mwl",
				"line": 56,
				"column": 1
			},
			"gettext": []
		},
		{
			"tag": "type_matchup",
			"attributes": {
				"attacker": "beast",
				"defender": "ooze",
				"multiplier": "0.75"
			},
			"children": [],
			"location": {
				"file": "examples/battle/content/battle.mwl",
				"line": 61,
				"column": 1
			},
			"gettext": []
		},
		{
			"tag": "evolution",
			"attributes": {
				"from": "slime",
				"into": "royal_slime",
				"level": "3"
			},
			"children": [],
			"location": {
				"file": "examples/battle/content/battle.mwl",
				"line": 66,
				"column": 1
			},
			"gettext": []
		}
	],
	"assets": [],
	"messages": [
		"Creature battle",
		"royal slime",
		"slime",
		"wolf"
	]
} as const;
