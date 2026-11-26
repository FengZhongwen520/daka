package com.daka.serve.infrastructure.persistence;

import com.daka.serve.domain.model.UserAccount;
import com.daka.serve.domain.repository.UserAccountRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public class JpaUserAccountRepository implements UserAccountRepository {
    private final UserJpaRepository repository;

    public JpaUserAccountRepository(UserJpaRepository repository) {
        this.repository = repository;
    }

    @Override
    public Optional<UserAccount> findById(UUID id) {
        return repository.findById(id).map(this::toDomain);
    }

    @Override
    public Optional<UserAccount> findByLoginLookup(String loginLookup) {
        return repository.findByLoginLookup(loginLookup).map(this::toDomain);
    }

    @Override
    public UserAccount save(UserAccount user) {
        return toDomain(repository.save(toEntity(user)));
    }

    private UserAccount toDomain(UserJpaEntity entity) {
        return new UserAccount(
            entity.getId(),
            entity.getLoginLookup(),
            entity.getEncryptedLogin(),
            entity.getPasswordHash(),
            entity.getCreatedAt()
        );
    }

    private UserJpaEntity toEntity(UserAccount user) {
        UserJpaEntity entity = new UserJpaEntity();
        entity.setId(user.id());
        entity.setLoginLookup(user.loginLookup());
        entity.setEncryptedLogin(user.encryptedLogin());
        entity.setPasswordHash(user.passwordHash());
        entity.setCreatedAt(user.createdAt());
        return entity;
    }
}
