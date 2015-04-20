(function() {

/**
 * Requirements for A* implementation
 * used to find the "shortest path" to reach the PacMan
 */

var HeapElement = function(x, y, initial_direction, dist_from_start, dist_to_end) {
	this.x = x;
	this.y = y;
	this.initial_direction = initial_direction;
	this.dist_from_start = dist_from_start; // real distance
	this.dist_to_end = dist_to_end; // distance measured for a line
	this.dist = dist_from_start + dist_to_end;
};

var Heap = function() {
	this.elements = new Array();
	this.num_elements = 0;
	
	this.push = function(heap_element) {
		// room available?
		if (this.elements.length > this.num_elements)
			this.elements[this.num_elements] = heap_element;
		else
			this.elements.push(heap_element);
		
		this.num_elements++;
		this.moveUp(this.num_elements -1);
	};
	
	this.pop = function() {
		var head_heap_elt = this.elements[0];
		this.num_elements--;

		if (this.num_elements == 0)
			return head_heap_elt;
		
		this.elements[0] = this.elements[this.num_elements];
		this.moveDown(0);
		return head_heap_elt;
	};
	
	this.free = function() {
		this.elements = new Array();
	};
	
	this.size = function() {
		return this.num_elements;
	};
	
	this.moveUp = function(id) {
		if (id == 0)
			return;

		var parent_id = Math.floor((id -1)/2);
		if (this.elements[id].dist < this.elements[parent_id].dist) {
			var tmp_heap_elt = this.elements[id];
			this.elements[id] = this.elements[parent_id];
			this.elements[parent_id] = tmp_heap_elt;
			this.moveUp(parent_id);
		}
	};
	
	this.moveDown = function(id) {
		var child1_id = id*2 +1;
		if (child1_id >= this.num_elements) // it does not have any child
			return;
		
		var child_id = child1_id;
		var child2_id = id*2 +2;
		if (child2_id < this.num_elements) { // only one child
			if (this.elements[child2_id].dist < this.elements[child1_id].dist) {
				child_id = child2_id;
			}
		}
		if (this.elements[child_id].dist < this.elements[id].dist) {
			var tmp_heap_elt = this.elements[id];
			this.elements[id] = this.elements[child_id];
			this.elements[child_id] = tmp_heap_elt;
			this.moveDown(child_id);
		}
	};
};

/*
 * Module definition
 */

module.exports.HeapElement = HeapElement;
module.exports.Heap = Heap;

}());

