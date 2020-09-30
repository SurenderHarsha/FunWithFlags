# jsrl - FUN WITH FLAGS

Javascript implementation of RUGged Learning for studying the names of flags, including the implementation of continuous correctness scores.

# some info for Jorge and Surender

This folder contains several files. Here follows a short description of the most important files.
JSRL
    css
        This folder contains all styling and layout scripts
    data
        In this folder, participant data will be stored in .csv file format
    js 
        This folder contains all scripts that are used in the program. The most important ones are 
            - index.html, which contains all timeline components of the experiment
            - rl-model.js, which contains the python code for the rugged learning model.
            - jspsych-html-keyboard-word-response, which is a plugin that is used to create each trial (listen to the keyboard, etc.) In this plugin, the correctness of the trials are estimated. 
            
            @Jorge and Surender - in the spsych-html-keyboard-word-response plugin we need to change the 'is-response-correct' function to compute a continuous score. 
            
            In the rl-model.js script, we would need to change the 'normalize-reaction-time' function:

            function normalise_reaction_time(response) {
            const reaction_time = response.correct ? response.rt : 60 * 1000; 
             const max_reaction_time = get_max_reaction_time_for_fact(response.text);
            return reaction_time > max_reaction_time ? max_reaction_time : reaction_time;

            In this function, the RT is set to 6 secs if the answer is incorrect. Here we can add the formula that I have proposed during the presentation. 


To run the experiment:

1. run the following line in your terminal:

    cd jsrl && php -S localhost:8080

2. enter the follwing link in a web browser:
    
    localhost:8080/index.html



Or run in Docker:

Docker needs to be given ownership of the data folder (only once) [(details)](https://stackoverflow.com/questions/3740152/how-do-i-set-chmod-for-a-folder-and-all-of-its-subfolders-and-files):

    sudo chown -R 33:33 jsrl/data

(Depending on the system's permissions setup, read access may also need to be given for the whole directory.)

Launch the server:

    sudo docker-compose up

### Troubleshooting

Setup options can be changed at the top of the `index.html` file.



