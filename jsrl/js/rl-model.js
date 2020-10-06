//-------------------//
//     RL mol      //
//-------------------//

// Load facts from file and parse as a dictionary
var facts;

function load_facts(filename, shuffle_items, callback) {
    jQuery.get(filename, function (data) {
        facts = Papa.parse(data, {
            header: true,
            skipEmptyLines: "greedy"
        }).data;

        facts.forEach(fact => {
            if (typeof fact.mu !== "undefined") {
                fact.mu = Number(fact.mu);
            } else {
                fact.mu = default_alpha;
            }
            if (typeof fact.kappa !== "undefined") {
                fact.kappa = Number(fact.kappa);
            } else {
                fact.kappa = kappa_0;
            }
            if (typeof fact.a !== "undefined") {
                fact.a = Number(fact.a);
            } else {
                fact.a = a_0;
            }
            if (typeof fact.b !== "undefined") {
                fact.b = Number(fact.b);
            } else {
                fact.b = b_0;
            }
            if (typeof fact.mu_domain !== "undefined") {
                fact.mu_domain = Number(fact.mu_domain);
            } else {
                fact.mu_domain = default_alpha;
            }

        });
        if (shuffle_items) {
            facts = shuffle(facts);
        }
        if (callback) callback();
    });

    return facts

}

function set_facts(fact_list, shuffle_items = false, callback) {
    facts = JSON.parse(JSON.stringify(fact_list));
    if (shuffle_items) {
        facts = shuffle(facts);
    }
    if (callback) callback();
}

function create_stimulus_lists(materials) {
    load_facts(materials, false, function () {
        // Sort by predicted fact alpha
        facts.sort(function (a, b) { return a.mu - b.mu });

        // Split into easy and hard halves, shuffle both
        facts_easy = shuffle(facts.splice(0, Math.ceil(facts.length / 2)));
        facts_hard = shuffle(facts);

        // Split shuffled easy and hard halves in half again
        facts_easy_half = facts_easy.splice(0, Math.ceil(facts_easy.length / 2));
        facts_hard_half = facts_hard.splice(0, Math.ceil(facts_hard.length / 2));

        // Combine into two lists
        facts_1 = facts_easy_half.concat(facts_hard_half);
        facts_2 = facts_easy.concat(facts_hard);

        reset_model();
    });
}



var test_facts = [];
var responses = [];

function record_response(data, log_fact = false) {
    responses.push(data);

    // If this is the third response for a fact, inform the server
    const responses_for_fact = responses.filter(response => response.id == data.id);
    if (responses_for_fact.length == 3 && log_fact) {
        send_fact_file_to_server(data.id, null);
    }

}


function send_fact_file_to_server(id, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'post-fact-observation.php');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
        if (this.readyState === XMLHttpRequest.DONE && this.status === 200) {
            if (callback) callback();
        }
    }
    xhr.send(JSON.stringify({ filename: id + "_" + subject_id, filedata: {} }));

}

function reset_model(callback) {
    facts = [];
    test_facts = [];
    responses = [];

    if (callback) callback();
}


function shuffle_test_facts() {
    test_facts = shuffle(test_facts);
}


function test_all_facts(shuffle_items = false) {
    test_facts = JSON.parse(JSON.stringify(facts));

    if (shuffle_items) {
        shuffle_test_facts();
    }
}


function get_next_fact(current_time, get_from_server = false) {

    //console.log(facts)

    // Calculate fact activations 15 seconds in the future
    const fact_activations = facts.map(fact => {
        return {
            fact: fact,
            activation: calculate_activation(current_time + lookahead_time, fact, responses),
        };
    });

    let [seen_facts, not_seen_facts] = partition(fact_activations, has_seen);
    test_facts = seen_facts.map(a => a.fact); // Update list of facts to be tested

    // Prevent an immediate repetition of the same fact
    if (seen_facts.length > 2) {
        const last_response = responses[responses.length - 1];
        seen_facts = seen_facts.filter(f => last_response.id != f.fact.id);
    }

    if (not_seen_facts.length === 0 || test_facts.length === 30 || seen_facts.some(has_forgotten)) {
        // Reinforce weakest forgotten fact
        const weakest_fact = min(seen_facts, fact => fact.activation);
        question = weakest_fact.fact;
        question.study = false; // Don't show the answer
    } else {
        // Present a new fact
        if (get_from_server) {
            new_fact_id = get_new_fact();
            new_fact = not_seen_facts.filter(f => f.fact.id == new_fact_id)[0];
        } else {
            new_fact = not_seen_facts[0];
        }
        question = new_fact.fact;
        question.study = true; // Show the answer
    }
    
    const log_fact_activations = calculate_activation(current_time + lookahead_time, question, responses);
    question.log_fact_activations = log_fact_activations;
    const log_fact_alpha = calculate_alpha(question,responses);
    question.log_fact_alpha = log_fact_alpha;
    const log_reading_time = get_reading_time(question.question);
    question.log_reading_time = log_reading_time;
    const log_estimated_rt = estimate_reaction_time_from_activation(log_fact_activations, log_reading_time);
    question.log_estimated_rt = log_estimated_rt;

    return question;
   

    function has_forgotten(fact) {
        return fact.activation < forget_threshold;
    }

    function has_seen(fact) {
        return fact.activation > Number.NEGATIVE_INFINITY;
    }
}


function get_new_cal(it) {
    question = facts[it];
    return question
}

function get_new_fact() {
    var fact_id = null;
    var xhr = new XMLHttpRequest();
    xhr.open('POST', 'get-new-fact.php', false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onreadystatechange = function () {
        if (this.readyState === XMLHttpRequest.DONE && this.status === 200) {
            fact_id = xhr.responseText;
        }
    }
    xhr.send(JSON.stringify({
        subject_id: subject_id,
        studied: responses.filter(r => r.study === true).map(r => r.id)
    }));
    return (fact_id);
}

function get_next_practised_fact() {
    var test_fact = test_facts.shift();
    test_fact.study = false;
    return test_fact;
}

function is_next_practised_fact() {
    return test_facts.length > 0;
}

function calculate_activation(time, fact, responses) {
    const encounters = [];
    const responses_for_fact = responses.filter(response => response.id == fact.id);
    let alpha = fact.mu;

    for (const response of responses_for_fact) {
        const activation = calculate_activation_from_encounters(encounters, response.presentation_start_time);
        encounters.push({
            activation: activation,
            time: response.presentation_start_time,
            reaction_time: normalise_reaction_time(response)
        });

        // Update alpha estimate and recalculate all decays
        alpha = estimate_alpha(encounters, activation, response, alpha, fact.mu);

        for (const encounter of encounters) {
            encounter.decay = calculate_decay(encounter.activation, alpha);
        }

    }
    return calculate_activation_from_encounters(encounters, time);
}

function calculate_alpha(fact, responses) {
    const encounters = [];
    const responses_for_fact = responses.filter(response => response.id == fact.id);
    let alpha = fact.mu;

    for (const response of responses_for_fact) {
        const activation = calculate_activation_from_encounters(encounters, response.presentation_start_time);
        encounters.push({
            activation: activation,
            time: response.presentation_start_time,
            reaction_time: normalise_reaction_time(response)
        });

        // Update alpha estimate and recalculate all decays
        alpha = estimate_alpha(encounters, activation, response, alpha, fact.mu);

        for (const encounter of encounters) {
            encounter.decay = calculate_decay(encounter.activation, alpha);
        }

    }
    
    alpha = normalize_alpha(alpha);
    
    return alpha
}

function estimate_alpha(encounters, activation, response, previous_alpha, mu) {
    if (encounters.length < 3) {
        return mu;
    }

    let a0 = -Infinity;
    let a1 = Infinity;
    const a_fit = previous_alpha;
    const reading_time = get_reading_time(response.text);
    const estimated_rt = estimate_reaction_time_from_activation(activation, reading_time);
    const est_diff = estimated_rt - normalise_reaction_time(response);

    if (est_diff < 0) {
        // Estimated RT was too short (estimated m too high), so actual decay was larger
        a0 = a_fit;
        a1 = a_fit + 0.05;
    }
    else {
        // Estimated RT was too long (estimated m too low), so actual decay was smaller
        a0 = a_fit - 0.05;
        a1 = a_fit;
    }

    // Binary search between previous fit and new alpha
    for (let j = 0; j < 6; ++j) {
        // adjust all decays to use the new alpha (easy since alpha is just an offset)
        const a0_diff = a0 - a_fit;
        const a1_diff = a1 - a_fit;
        const d_a0 = encounters.map(encounter => {
            return {
                activation: encounter.activation,
                decay: encounter.decay + a0_diff,
                rt: encounter.reaction_time,
                time: encounter.time
            };
        });
        const d_a1 = encounters.map(encounter => {
            return {
                activation: encounter.activation,
                decay: encounter.decay + a1_diff,
                rt: encounter.reaction_time,
                time: encounter.time
            };
        });

        // calculate the reaction times from activation and compare against observed reaction times
        const encounter_window = encounters.slice(Math.max(1, encounters.length - 5));
        const total_a0_error = calculate_predicted_reaction_time_error(encounter_window, d_a0, reading_time);
        const total_a1_error = calculate_predicted_reaction_time_error(encounter_window, d_a1, reading_time);

        // adjust the search area based on total error
        const ac = (a0 + a1) / 2;
        if (total_a0_error < total_a1_error) {
            a1 = ac; // search between a0 and ac
        } else {
            a0 = ac; // search between ac and a1
        }
    }

    // narrowed range, take average of the two values as the new alpha for this item
    return (a0 + a1) / 2;

}

function calculate_activation_from_encounters(encounters, time) {
    const sum = sum_with(encounters, encounter => {
        if (encounter.time < time) {
            // only include encounters seen before time
            return Math.pow((time - encounter.time) / 1000, -encounter.decay);
        } else {
            return 0;
        }
    });
    return Math.log(sum);
}

function calculate_decay(activation, alpha) {
    const c = 0.25;
    return c * Math.exp(activation) + alpha;
}

function calculate_predicted_reaction_time_error(test_set, decay_adjusted_encounters, reading_time) {
    return sum_with(test_set, (encounter) => {
        const m = calculate_activation_from_encounters(decay_adjusted_encounters, encounter.time - 100);
        const rt = estimate_reaction_time_from_activation(m, reading_time);
        return Math.abs(encounter.reaction_time - rt);
    });
}

function count_words(text) {
    return text.split(' ').length;
}

function count_characters(text) {
    return text.length;
}

function estimate_reaction_time_from_activation(activation, reading_time) {
    const F = 1.0;
    return (F * Math.exp(-activation) + (reading_time / 1000)) * 1000;
}

function get_max_reaction_time_for_fact(text) {
    const reading_time = get_reading_time(text);
    return 1.5 * estimate_reaction_time_from_activation(forget_threshold, reading_time)
}

function get_reading_time(text) {
    const word_count = count_words(text);
    if (word_count > 1) {
        const character_count = count_characters(text);
        return Math.max((-157.9 + character_count * 19.5), 300);
    } else {
        return 300;
    }
}

function min(list, minWith) {
    let min = list[0];
    for (const element of list) {
        if (minWith(element) < minWith(min)) {
            min = element;
        }
    }
    return min;
}

function normalise_reaction_time(response) {

    if (response.block == 'A'){
        const reaction_time = response.correct ? response.rt : 60 * 1000;
        const max_reaction_time = get_max_reaction_time_for_fact(response.text);
        return reaction_time > max_reaction_time ? max_reaction_time : reaction_time;
        
    }

    else if (response.block == "B"){
        
        var reaction_time = [];
        const distance_factor = 0.8;
        
        if (response.cont_score > 25) {
            reaction_time = response.rt * distance_factor * (1 + (1 - (response.cont_score/100)) );
        }
        else {
            reaction_time = 6000
        }
        
        const max_reaction_time = get_max_reaction_time_for_fact(response.text);
       
        console.log('actual RT: ' + response.rt)
        console.log('score: ' + response.cont_score)
        console.log('adj RT: ' + reaction_time)
    
        return reaction_time > max_reaction_time ? max_reaction_time : reaction_time;

    }
    
}




function normalize_alpha(alpha) {
    if(alpha > 0.5) {
        alpha = 0.5;
    } else if (alpha < 0.15) {
      alpha = 0.15;
    }
 return alpha;
}

function partition(list, partitionFunction) {
    const result = [[], []];
    for (const element of list) {
        result[partitionFunction(element) ? 0 : 1].push(element);
    }
    return result;
}

function sum_with(list, summer) {
    let sum = 0;
    for (const element of list) {
        sum += summer(element);
    }
    return sum;
}

function shuffle(array) {
    var current_index = array.length;
    var temp_val;
    var random_index;

    while (0 !== current_index) {

        random_index = Math.floor(Math.random() * current_index);
        current_index -= 1;

        temp_val = array[current_index];
        array[current_index] = array[random_index];
        array[random_index] = temp_val;
    }

    return array;
}
