package com.daka.serve.domain.repository;

import com.daka.serve.domain.model.UserAccount;

import java.util.Optional;
import java.util.UUID;

public interface UserAccountRepository {
    Optional<UserAccount> findById(UUID id);

    Optional<UserAccount> findByLoginLookup(String loginLookup);

    UserAccount save(UserAccount user);
}
