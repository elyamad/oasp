In this directory you create your workspaces (typically one for each branch). There is always one
MAIN_BRANCH (see variables.bat) such as main, master, or trunk. You can add any new workspace
by creating an empty folder here. Once you called "update-all-workspaces" the workspaces are 
initialized/updated and an according eclipse-<workspace> start script is created. You can checkout
the according branch to that workspace folder and import the projects into the corresponding eclipse
instance. The workspace name is also visible in the title-bar of Eclipse so you get orientation when
you have multiple instances of eclipse running simultaneously.

The "examples" workspace contains sample application showcasing Devon functionality. If you are not
interested in it, you can safely delete it
