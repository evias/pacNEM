'use strict';

var Heap = require('../../../www/tools/heap.js').Heap;

var Elt = function(value, dist) {
	this.value = value;
	this.dist = dist;
};

describe('Heap tests', function() {
	it('Create an empty Heap', function(done) {
		var h = new Heap();
		h.size().should.equal(0);
		done();
	});
	it('Add multiple elements to an existing Heap', function(done) {
		var h = new Heap();
		h.size().should.equal(0);
		h.push(new Elt(50, 50));
		h.size().should.equal(1);
		h.push(new Elt(70, 70));
		h.size().should.equal(2);
		done();
	});
	it('Add multiple elements to an existing Heap (including identical ones)', function(done) {
		var h = new Heap();
		h.size().should.equal(0);
		h.push(new Elt(50, 50));
		h.size().should.equal(1);
		h.push(new Elt(50, 50));
		h.size().should.equal(2);
		done();
	});
	it('Free an existing Heap', function(done) {
		var h = new Heap();
		h.push(new Elt(50, 50));
		h.free();
		h.size().should.equal(0);
		done();
	});
	it('Free an existing Heap and add new elements', function(done) {
		var h = new Heap();
		h.push(new Elt(50, 50));
		h.free();
		h.size().should.equal(0);
		h.push(50);
		h.size().should.equal(1);
		done();
	});
	it('Pop an element reduces the size by 1', function(done) {
		var h = new Heap();
		h.push(new Elt(10, 10));
		h.push(new Elt(20, 20));
		h.push(new Elt(30, 30));
		h.size().should.equal(3);
		h.pop();
		h.size().should.equal(2);
		h.pop();
		h.size().should.equal(1);
		h.pop();
		h.size().should.equal(0);
		done();
	});
	it('Pop undefined element when empty', function(done) {
		var h = new Heap();
		(h.pop() === undefined).should.be.ok;
		h.size().should.equal(0);
		done();
	});
	it('Pop is one of the pushed objects', function(done) {
		var h = new Heap();
		var pushed = new Elt(50, 50);
		h.push(pushed);
		var p = h.pop();
		p.should.be.an.instanceOf(Elt);
		p.should.equal(pushed);
		done();
	});
	it('Pop is one of the pushed objects', function(done) {
		var h = new Heap();
		var pushed = new Elt(50, 50);
		h.push(pushed);
		var p = h.pop();
		p.should.be.an.instanceOf(Elt);
		p.should.equal(pushed);
		done();
	});
	it('Pop min dist first', function(done) {
		var h = new Heap();
		h.push(new Elt(50, 50));
		h.push(new Elt(10, 10));
		h.push(new Elt(90, 90));
		h.pop().dist.should.be.equal(10);
		h.pop().dist.should.be.equal(50);
		h.pop().dist.should.be.equal(90);
		done();
	});
	it('Pop min dist first even after other pop', function(done) {
		var h = new Heap();
		h.push(new Elt(50, 50));
		h.push(new Elt(10, 10));
		h.push(new Elt(90, 90));
		h.pop().dist.should.be.equal(10);
		h.push(new Elt(10, 10));
		h.push(new Elt(10, 10));
		h.push(new Elt(70, 70));
		h.push(new Elt(80, 80));
		h.pop().dist.should.be.equal(10);
		h.pop().dist.should.be.equal(10);
		h.pop().dist.should.be.equal(50);
		h.pop().dist.should.be.equal(70);
		h.pop().dist.should.be.equal(80);
		h.pop().dist.should.be.equal(90);
		done();
	});
	it('Distinct Heap have distinct data', function(done) {
		var h1 = new Heap();
		var h2 = new Heap();
		h1.push(new Elt(50, 50));
		h1.push(new Elt(10, 10));
		h1.push(new Elt(90, 90));
		h2.push(new Elt(10, 10));
		h2.push(new Elt(10, 10));
		h2.push(new Elt(70, 70));
		h2.push(new Elt(80, 80));
		
		h1.size().should.be.equal(3);
		h1.pop().dist.should.be.equal(10);
		h1.pop().dist.should.be.equal(50);
		h1.pop().dist.should.be.equal(90);
		h1.size().should.be.equal(0);
		
		h2.size().should.be.equal(4);
		h2.pop().dist.should.be.equal(10);
		h2.pop().dist.should.be.equal(10);
		h2.pop().dist.should.be.equal(70);
		h2.pop().dist.should.be.equal(80);
		h2.size().should.be.equal(0);
		done();
	});
});

