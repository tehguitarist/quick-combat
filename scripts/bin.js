//socket functions
export let socket;

export async function ask_initiative(npc_options, actor_id) {
	return new Promise((resolve, reject) => {
		var actor = game.actors.get(actor_id)
		new Dialog({
			title: game.i18n.localize("QuickCombat.PF2E.title"),
			content: `${actor.name}</br><select id='inits'>${npc_options}</select>`,
			buttons: {
				button: {
					label: game.i18n.localize("QuickCombat.PF2E.updateButton"),
					icon: "<i class='fas fa-check'></i>",
					callback: async  (html) => {
						var inits = html.find("select#inits").find(":selected").val()
						console.debug(`quick-combat | updating ${actor.name} initiative to ${inits}`)
						//actor.update({"system.attributes.initiative.ability": inits})
						resolve(inits)
					}
				}
			},
		}).render(true);
	})
}

Hooks.once("socketlib.ready", () => {
	socket = socketlib.registerModule("quick-combat");
	socket.register("ask_initiative", ask_initiative);
});

//playlist functions
export class PlaylistHandler {
	async save(stop=false) {
		let playlists = []
		//list old playlists
		game.playlists.playing.forEach(function(playing) {
			var track_ids = playing.sounds.filter(a => a.playing == true).map(a => a.id)
			playlists.push({id:playing.id,track_ids:track_ids})
			//if a new playlist was given stop the old ones
			if (stop) {
				console.debug(`quick-combat | stopping old playlist ${playing.name}`)
				playing.stopAll()
			}
		});
		game.settings.set("quick-combat", "oldPlaylist", playlists)
	}

	async start(playlist) {
		if (playlist && playlist.sounds.size > 0) {
			await this.save(true)
			game.settings.set("quick-combat", "combatPlaylist", playlist.id)
			console.log(`quick-combat | starting combat playlist ${playlist.name}`)
			playlist.playAll()
		}
		else {
			await this.save(false)
			console.debug("quick-combat | setting no playlist to start")
			game.settings.set("quick-combat", "combatPlaylist", null)
		}
	}

	get(fanfare = false, pickone = false) {
		//get scene playlists
		let scene = game.scenes.active.id
		let playlists = []
		//get scene playlists
		playlists = game.settings.get("quick-combat", "playlists").filter(a => a.scene == scene && a.fanfare == fanfare)
		//if not scene playlists get all "" scenes
		if (playlists.length == 0) {
			playlists = game.settings.get("quick-combat", "playlists").filter(a => a.scene == "" && a.fanfare == fanfare)
		}
		//if still no playlists then return None
		if (playlists.length == 0) {
			return null
		}
		//get the playlist object
		if (pickone) {
			//select a random playlist
			return game.playlists.get(playlists[Math.floor(Math.random()*playlists.length)].id)
		}
		else {
			let a = []
			for (var i = 0; i < playlists.length; i++) {
				var tmp = game.playlists.get(playlists[i].id)
				a.push(tmp)
			}
			return a
		}
	}
}

//if hotkey was pressed create combat, add combatants, start combat
export async function hotkey() {
	console.debug("quick-combat | combat hotkey pressed")
	if (game.combat) {
		console.debug("quick-combat | combat found stopping combat")
		game.combat.endCombat();
	}
	else {
		console.debug("quick-combat | starting combat")
		//check if GM has any selected tokens
		if (canvas.tokens.controlled.length === 0) {
			ui.notifications.error(game.i18n.localize("QuickCombat.KeyError"));
		}
		else {			
			console.debug("quick-combat | getting player tokens skipping Pets/Summons")
			var tokens = canvas.tokens.controlled.filter(t => !t.inCombat).filter(t => t.actor.items.filter(i => i.name == "Pet" || i.name == "Summon").length == 0)
			//render combat
			//rip off  async toggleCombat(state=true, combat=null, {token=null}={}) from  base game line ~36882
			var combat = game.combats.viewed;
			if (!combat) {
				if (game.user.isGM) {
					console.debug("quick-combat | creating new combat")
					const cls = getDocumentClass("Combat");
					combat = await cls.create({scene: canvas.scene.id, active: true}, {render: !tokens.length});
				} else {
					ui.notifications.warn("COMBAT.NoneActive", {localize: true});
					combat = null
				}
			}
			//if there is a combat created
			if (combat != null) {
				// Process each controlled token, as well as the reference token
				console.debug("quick-combat | adding combatants to combat")
				const createData = tokens.map(t => {
					return {
						tokenId: t.id,
						sceneId: t.scene.id,
						actorId: t.document.actorId,
						hidden: t.document.hidden
					}
				});
				await combat.createEmbeddedDocuments("Combatant", createData)
			}
			//if no combat was created something went wrong and return
			else {
				return
			}
			//start the combat as long as its not OSE
			if (CONFIG.hasOwnProperty("OSE")) {
				console.debug("quick-combat | skipping combat start for OSE")
				return
			}
			console.log("quick-combat | starting combat")
			await combat.startCombat();
		}
	}
}