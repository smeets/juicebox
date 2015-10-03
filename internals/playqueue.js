/*
 * This module manages the play queue.
 *
 * Idea is that the queue is exposed as a restful resource, so that external
 * (and internal) actors can manipulate it.
 *
 * These routes won't do any link resolving:
 *
 *	GET / 		--> [queue]			// get the whole queue
 *	GET /:index	--> { url: queue[:index] }	// get a specific index
 *	PUT /		{ queue: [url,..,url] }		// set the whole queue
 *	PUT /:index	{ url: ".." }			// set a specific index
 *
 * A special route for adding to the tail of the queue, including resolving:
 *
 *	POST /		{ url: ".." }			// resolve and add
 */
var fs = require('fs')
var router = require('express').Router()
var queue = []
var preprocessors = []
var pq = { path: 'queue.json', persist: true }

function initialize (conf, prep) {
	pq = conf.playqueue

	// Given by index.js
	preprocessors = prep

	if (pq.persist) {
		try {
			queue = JSON.parse(fs.readFileSync(pq.path))
			console.log('loaded', queue.length, 'tracks into play queue')
		} catch (e) {
			console.error('error while loading', pq.path, 'into play queue')
			console.error(e.message)
			console.error('edit conf.toml if you wish to disable this feature')
			process.exit(1)
		}
	}

	return { 
		peek:   function () { return queue[0] },
		pop:    function () { return queue.push(queue.shift()) },
		length: function () { return queue.length },
		router: router
	}
}

router.use(require('body-parser').json())

router.get('/', function (req, res) {
	res.json(queue)
})

router.get('/:index', function (req, res) {
	var index = req.params.index

	if (index >= queue.length) {
		res.status(400).send('Index out of range').end()
		return
	}

	// TODO: Figure out how much to add instead of this dumb solution.
	while (index < 0)
		index += queue.length
	
	res.json({ url: queue[index] })
})

router.put('/', function (req, res) {
	if (!req.body.queue) {
		res.status(400).send('Action requires queue object').end()
		return
	}

	queue = req.body.queue
})

router.put('/:index', function (req, res) {
	var index = req.params.index

	if (index >= queue.length) {
		res.status(400).send('Index of out range').end()
		return
	}

	if (!req.body.url) {
		res.status(400).send('Action requires url property').end()
		return
	}
	
	// TODO: Figure out how much to add instead of this dumb solution.
	while (index < 0)
		index += queue.length

	queue[index] = req.body.url
})

router.post('/', function (req, res) {
	var url = req.body.url

	if (!url) {
		res.status(400).send('Action requires url property').end()
		return
	}

	var preprocessed = false
	for (var i = 0; i < preprocessors.length; i++) {
		preprocessed = preprocessors.evaluate(url) || preprocessed
	}

	if (preprocessed) {
		res.status(202).send('Accepted -- Processing').end()
		return
	}

	queue.push(url)

	if (pq.persist) {
		fs.writeFile(pq.path, JSON.stringify(queue), function (err) {
			if (err)
				console.error('error writing queue to file', pq.path)
		})
	}

	res.status(200).send('Success').end()	
})

module.exports = function (conf, preprocessors) {
	return initialize(conf, preprocessors)
}