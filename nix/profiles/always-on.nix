{
  # Keep the Mac mini reachable while allowing an attached display to sleep.
  power = {
    sleep.computer = "never";
    sleep.display = 15;
    restartAfterPowerFailure = true;
  };

  networking.wakeOnLan.enable = true;

  # Remote administration is key-only. This public key belongs to the MacBook;
  # no private key or credential is stored in the repository.
  services.openssh = {
    enable = true;
    extraConfig = ''
      PasswordAuthentication no
      KbdInteractiveAuthentication no
      PermitRootLogin no
      AllowUsers kostyafarber
    '';
  };

  users.users.kostyafarber.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIE1hMCDKl2i4tCnVL2q9E0Vx5Rtw9dCGvFMqwsFRAq3z kostya.farber@gmail.com"
  ];
}
