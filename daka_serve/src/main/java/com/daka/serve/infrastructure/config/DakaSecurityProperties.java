package com.daka.serve.infrastructure.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "daka.security")
public class DakaSecurityProperties {
    private String encryptionKey = "";
    private String lookupPepper = "";
    private long sessionDays = 30;

    public String getEncryptionKey() {
        return encryptionKey;
    }

    public void setEncryptionKey(String encryptionKey) {
        this.encryptionKey = encryptionKey;
    }

    public String getLookupPepper() {
        return lookupPepper;
    }

    public void setLookupPepper(String lookupPepper) {
        this.lookupPepper = lookupPepper;
    }

    public long getSessionDays() {
        return sessionDays;
    }

    public void setSessionDays(long sessionDays) {
        this.sessionDays = sessionDays;
    }
}
