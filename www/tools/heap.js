(function() {

/**
 * Requirements for A* implementation
 * used to find the "shortest path" to reach the PacMan
 */

var Heap = function() {
	var elements_ = new Array();
	var num_elements_ = 0;
	
	this.push = function(heap_element) {
		// room available?
		if (elements_.length > num_elements_)
			elements_[num_elements_] = heap_element;
		else
			elements_.push(heap_element);
		
		num_elements_++;
		moveUp(num_elements_ -1);
	};
	
	this.pop = function() {
		if (num_elements_ == 0) {
			return undefined;
		}

		var head_heap_elt = elements_[0];
		num_elements_--;

		if (num_elements_ == 0)
			return head_heap_elt;
		
		elements_[0] = elements_[num_elements_];
		elements_.splice(num_elements_, 1);
		moveDown(0);
		return head_heap_elt;
	};
	
	this.free = function() {
		elements_ = new Array();
		num_elements_ = 0;
	};
	
	this.size = function() {
		return num_elements_;
	};
	
	var moveUp = function(id) {
		if (id == 0)
			return;

		var parent_id = Math.floor((id -1)/2);
		if (elements_[id].dist < elements_[parent_id].dist) {
			var tmp_heap_elt = elements_[id];
			elements_[id] = elements_[parent_id];
			elements_[parent_id] = tmp_heap_elt;
			moveUp(parent_id);
		}
	};
	
	var moveDown = function(id) {
		var child1_id = id*2 +1;
		if (child1_id >= num_elements_) // it does not have any child
			return;
		
		var child_id = child1_id;
		var child2_id = id*2 +2;
		if (child2_id < num_elements_) { // only one child
			if (elements_[child2_id].dist < elements_[child1_id].dist) {
				child_id = child2_id;
			}
		}
		if (elements_[child_id].dist < elements_[id].dist) {
			var tmp_heap_elt = elements_[id];
			elements_[id] = elements_[child_id];
			elements_[child_id] = tmp_heap_elt;
			moveDown(child_id);
		}
	};
};

/*
 * Module definition
 */

module.exports.Heap = Heap;

}());

