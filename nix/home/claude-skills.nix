{ config, lib, ... }:

let
  dotfiles = "${config.home.homeDirectory}/.dotfiles";

  # Some machines keep their own copies of these.
  keptPerMachine = [
    "learn-build"
    "shift-nightly"
  ];

  # Every skill folder in this repo. A flake only sees tracked files, so a new
  # skill links once it is added to git and the host is rebuilt.
  skills = lib.filterAttrs (
    name: type: type == "directory" && !(builtins.elem name keptPerMachine)
  ) (builtins.readDir ../../agents/.agents/skills);
in
{
  # Claude Code skills kept in this repo, on every machine.
  home.file = lib.mapAttrs' (
    name: _:
    lib.nameValuePair ".claude/skills/${name}" {
      source = config.lib.file.mkOutOfStoreSymlink "${dotfiles}/agents/.agents/skills/${name}";
    }
  ) skills;
}
