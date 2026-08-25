{
  # Keep the Mac mini reachable while allowing an attached display to sleep.
  power = {
    sleep.computer = "never";
    sleep.display = 15;
    restartAfterPowerFailure = true;
  };

  networking.wakeOnLan.enable = true;
}
