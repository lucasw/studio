
FROM ubuntu:20.04

ENV DEBIAN_FRONTEND="noninteractive"
# TODO(lucasw) pass this in as var
ENV TZ="America/Los_Angeles"

# replace shell with bash so we can source files
RUN rm /bin/sh && ln -s /bin/bash /bin/sh

RUN apt-get update
RUN apt-get install -y curl git gnupg2 sudo

# install node
ARG NODE_VERSION=14.16.0
ARG NODE_PACKAGE=node-v$NODE_VERSION-linux-x64
ARG NODE_HOME=/opt/$NODE_PACKAGE
ENV NODE_PATH $NODE_HOME/lib/node_modules
ENV PATH $NODE_HOME/bin:$PATH
RUN curl https://nodejs.org/dist/v$NODE_VERSION/$NODE_PACKAGE.tar.gz | tar -xzC /opt/
RUN node -v

# install yarn
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
RUN apt-get update
RUN apt-get install --no-install-recommends yarn
RUN yarn -v

ADD . /home/studio
WORKDIR /home/studio
RUN yarn install

RUN apt-get install -y libglib2.0-0
RUN apt-get install -y libgtk-3-0 libnotify4 libnss3 libxtst6 xdg-utils libdrm2 libgbm1 libxcb-dri3-0
RUN apt-get install -y libgtkextra-dev libgconf2-dev libnss3 libasound2 libxtst-dev libxss1

CMD yarn serve
# CMD yarn start

# docker build . -t foxglove_studio
# docker run -it --network=host foxglove_studio
# docker run -it --network=host foxglove_studio yarn start
