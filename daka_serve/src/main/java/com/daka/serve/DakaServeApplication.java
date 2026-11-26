package com.daka.serve;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class DakaServeApplication {
    public static void main(String[] args) {
        SpringApplication.run(DakaServeApplication.class, args);
    }
}
